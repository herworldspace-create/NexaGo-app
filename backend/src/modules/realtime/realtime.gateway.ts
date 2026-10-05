import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../config/prisma.service';
import { AccessTokenPayload, resolveAuthenticatedUser } from '../auth/token-validation.util';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Role } from '../../common/enums/role.enum';
import { RideStatus, ACTIVE_RIDE_STATUSES } from '../../common/enums/ride-status.enum';
import { DeliveryStatus, ACTIVE_DELIVERY_STATUSES } from '../../common/enums/delivery-status.enum';
import { RidesService } from '../rides/rides.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DriverLocationService } from '../driver-verification/driver-location.service';
import { RideSubscribeDto } from './dto/ride-subscribe.dto';
import { DeliverySubscribeDto } from './dto/delivery-subscribe.dto';
import { DriverLocationPingDto } from './dto/driver-location-ping.dto';
import { validateWsPayload } from './ws-validation.util';
import { rideRoom, deliveryRoom, userRoom } from './rooms.util';

interface RideStatusChangedEvent {
  rideId: string;
  status: RideStatus;
  passengerUserId?: string;
  driverUserId?: string | null;
  reason?: string;
}

interface DeliveryStatusChangedEvent {
  deliveryId: string;
  status: DeliveryStatus;
  senderUserId?: string;
  driverUserId?: string | null;
  reason?: string;
}

/**
 * Scope of this gateway: post-match, ride/delivery-scoped real-time
 * updates only — driver location during an active job, and status
 * changes pushed to the parties involved. Broadcasting NEW ride/delivery
 * requests to searching drivers remains REST polling
 * (`GET /drivers/rides/available`, `GET /drivers/deliveries/available`)
 * plus the best-effort push nudge in NotificationsModule.
 *
 * CORS here is intentionally permissive for development; production
 * should restrict `cors.origin` the same way main.ts restricts REST CORS
 * (decorator metadata is evaluated before Nest's DI container exists, so
 * it can't directly read AppConfigService — a known, documented
 * simplification).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly ridesService: RidesService,
    private readonly deliveriesService: DeliveriesService,
    private readonly driverLocationService: DriverLocationService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('No access token supplied.');
      }

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      const user = await resolveAuthenticatedUser(this.prisma, payload);

      client.data.user = user;
      await client.join(userRoom(user.userId));
    } catch (error) {
      this.logger.warn(
        `Rejecting unauthenticated WebSocket connection: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Socket.IO automatically removes the socket from all rooms on disconnect.
  }

  @SubscribeMessage('ride:subscribe')
  async handleRideSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.requireUser(client);
    const dto = await validateWsPayload(RideSubscribeDto, body);

    // Reuses RidesService's own authorization rule (party to the ride, or
    // admin) — one source of truth shared with the REST GET /rides/:id.
    await this.ridesService.getRide(dto.rideId, user.userId, user.role);

    await client.join(rideRoom(dto.rideId));
    return { subscribed: true, rideId: dto.rideId };
  }

  @SubscribeMessage('ride:unsubscribe')
  handleRideUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { rideId?: string }) {
    if (body?.rideId) {
      client.leave(rideRoom(body.rideId));
    }
    return { unsubscribed: true };
  }

  @SubscribeMessage('delivery:subscribe')
  async handleDeliverySubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.requireUser(client);
    const dto = await validateWsPayload(DeliverySubscribeDto, body);

    await this.deliveriesService.getDelivery(dto.deliveryId, user.userId, user.role);

    await client.join(deliveryRoom(dto.deliveryId));
    return { subscribed: true, deliveryId: dto.deliveryId };
  }

  @SubscribeMessage('delivery:unsubscribe')
  handleDeliveryUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { deliveryId?: string }) {
    if (body?.deliveryId) {
      client.leave(deliveryRoom(body.deliveryId));
    }
    return { unsubscribed: true };
  }

  /**
   * In-trip location ping from a driver's app — works whether the
   * driver's current active job is a ride or a delivery. The job is
   * looked up server-side from the driver's own user id, never trusted
   * from the client payload, so a driver cannot spoof someone else's
   * job. Broadcasts only lat/lng/heading/timestamp — no driver profile
   * data — to whichever room applies.
   */
  @SubscribeMessage('driver:location')
  async handleDriverLocation(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.requireUser(client);
    if (user.role !== Role.DRIVER) {
      throw new WsException('Only drivers may send location pings.');
    }

    const dto = await validateWsPayload(DriverLocationPingDto, body);

    const activeRide = await this.ridesService.getCurrentForDriver(user.userId);
    const activeDelivery = activeRide ? null : await this.deliveriesService.getCurrentForDriver(user.userId);

    const hasActiveRide = activeRide && ACTIVE_RIDE_STATUSES.has(activeRide.status as unknown as RideStatus);
    const hasActiveDelivery =
      activeDelivery && ACTIVE_DELIVERY_STATUSES.has(activeDelivery.status as unknown as DeliveryStatus);

    if (!hasActiveRide && !hasActiveDelivery) {
      throw new WsException('You do not have an active ride or delivery.');
    }

    await this.driverLocationService.updatePositionOnly(user.userId, dto.latitude, dto.longitude, dto.heading);

    const payload = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      heading: dto.heading,
      timestamp: new Date().toISOString(),
    };

    if (hasActiveRide) {
      this.server.to(rideRoom(activeRide!.id)).emit('ride:driver_location', { rideId: activeRide!.id, ...payload });
    } else if (hasActiveDelivery) {
      this.server
        .to(deliveryRoom(activeDelivery!.id))
        .emit('delivery:driver_location', { deliveryId: activeDelivery!.id, ...payload });
    }

    return { acknowledged: true };
  }

  /**
   * Fired by RidesService (via EventEmitter2) on every ride status
   * transition. RidesService has no knowledge of sockets/rooms — this is
   * the only place that bridges the domain event to a broadcast.
   */
  @OnEvent('ride.status_changed')
  handleRideStatusChanged(event: RideStatusChangedEvent): void {
    const payload = { rideId: event.rideId, status: event.status, reason: event.reason };

    this.server.to(rideRoom(event.rideId)).emit('ride:status', payload);
    if (event.passengerUserId) {
      this.server.to(userRoom(event.passengerUserId)).emit('ride:status', payload);
    }
    if (event.driverUserId) {
      this.server.to(userRoom(event.driverUserId)).emit('ride:status', payload);
    }
  }

  /** Same bridging pattern as ride.status_changed, for deliveries. */
  @OnEvent('delivery.status_changed')
  handleDeliveryStatusChanged(event: DeliveryStatusChangedEvent): void {
    const payload = { deliveryId: event.deliveryId, status: event.status, reason: event.reason };

    this.server.to(deliveryRoom(event.deliveryId)).emit('delivery:status', payload);
    if (event.senderUserId) {
      this.server.to(userRoom(event.senderUserId)).emit('delivery:status', payload);
    }
    if (event.driverUserId) {
      this.server.to(userRoom(event.driverUserId)).emit('delivery:status', payload);
    }
  }

  private requireUser(client: Socket): AuthenticatedUser {
    const user = client.data?.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new WsException('Unauthenticated.');
    }
    return user;
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }
}
