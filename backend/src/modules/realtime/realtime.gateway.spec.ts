import { ForbiddenException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';
import { Role } from '../../common/enums/role.enum';
import { RideStatus } from '../../common/enums/ride-status.enum';

function buildSocketMock(user?: any) {
  return {
    data: { user },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn(),
    handshake: { auth: {}, headers: {} },
  };
}

function buildGateway() {
  const jwtService = { verifyAsync: jest.fn() };
  const config = { jwt: { accessSecret: 'secret' } };
  const prisma = { deviceSession: { findUnique: jest.fn() }, user: { findUnique: jest.fn() } };
  const ridesService = {
    getRide: jest.fn(),
    getCurrentForDriver: jest.fn(),
  };
  const deliveriesService = {
    getDelivery: jest.fn(),
    getCurrentForDriver: jest.fn(),
  };
  const driverLocationService = { updatePositionOnly: jest.fn() };

  const gateway = new RealtimeGateway(
    jwtService as any,
    config as any,
    prisma as any,
    ridesService as any,
    deliveriesService as any,
    driverLocationService as any,
  );
  gateway.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;

  return { gateway, jwtService, config, prisma, ridesService, deliveriesService, driverLocationService };
}

describe('RealtimeGateway', () => {
  describe('handleRideSubscribe', () => {
    it('rejects an unauthenticated socket', async () => {
      const { gateway } = buildGateway();
      const client = buildSocketMock(undefined);

      await expect(
        gateway.handleRideSubscribe(client as any, { rideId: '123e4567-e89b-12d3-a456-426614174000' }),
      ).rejects.toThrow(WsException);
    });

    it('rejects an invalid payload (bad UUID) before touching RidesService', async () => {
      const { gateway, ridesService } = buildGateway();
      const client = buildSocketMock({ userId: 'user-1', role: Role.PASSENGER, sessionId: 's1' });

      await expect(gateway.handleRideSubscribe(client as any, { rideId: 'not-a-uuid' })).rejects.toThrow(
        WsException,
      );
      expect(ridesService.getRide).not.toHaveBeenCalled();
    });

    it('propagates authorization failure from RidesService.getRide', async () => {
      const { gateway, ridesService } = buildGateway();
      const client = buildSocketMock({ userId: 'user-1', role: Role.PASSENGER, sessionId: 's1' });
      ridesService.getRide.mockRejectedValue(new ForbiddenException('nope'));

      await expect(
        gateway.handleRideSubscribe(client as any, { rideId: '123e4567-e89b-12d3-a456-426614174000' }),
      ).rejects.toThrow(ForbiddenException);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the ride room once authorized', async () => {
      const { gateway, ridesService } = buildGateway();
      const client = buildSocketMock({ userId: 'user-1', role: Role.PASSENGER, sessionId: 's1' });
      ridesService.getRide.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000' });

      const result = await gateway.handleRideSubscribe(client as any, {
        rideId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(client.join).toHaveBeenCalledWith('ride:123e4567-e89b-12d3-a456-426614174000');
      expect(result).toEqual({ subscribed: true, rideId: '123e4567-e89b-12d3-a456-426614174000' });
    });
  });

  describe('handleDriverLocation', () => {
    it('rejects a non-driver', async () => {
      const { gateway } = buildGateway();
      const client = buildSocketMock({ userId: 'user-1', role: Role.PASSENGER, sessionId: 's1' });

      await expect(
        gateway.handleDriverLocation(client as any, { latitude: 11.85, longitude: 13.16 }),
      ).rejects.toThrow(WsException);
    });

    it('rejects a driver with no active ride', async () => {
      const { gateway, ridesService } = buildGateway();
      const client = buildSocketMock({ userId: 'driver-1', role: Role.DRIVER, sessionId: 's1' });
      ridesService.getCurrentForDriver.mockResolvedValue(null);

      await expect(
        gateway.handleDriverLocation(client as any, { latitude: 11.85, longitude: 13.16 }),
      ).rejects.toThrow(WsException);
    });

    it('updates location and broadcasts to the ride room only (no driver profile data)', async () => {
      const { gateway, ridesService, driverLocationService } = buildGateway();
      const client = buildSocketMock({ userId: 'driver-1', role: Role.DRIVER, sessionId: 's1' });
      ridesService.getCurrentForDriver.mockResolvedValue({ id: 'ride-1', status: RideStatus.IN_PROGRESS });

      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;

      await gateway.handleDriverLocation(client as any, { latitude: 11.85, longitude: 13.16, heading: 90 });

      expect(driverLocationService.updatePositionOnly).toHaveBeenCalledWith('driver-1', 11.85, 13.16, 90);
      expect(gateway.server.to).toHaveBeenCalledWith('ride:ride-1');
      const [eventName, payload] = emit.mock.calls[0];
      expect(eventName).toBe('ride:driver_location');
      expect(payload).toEqual(
        expect.objectContaining({ rideId: 'ride-1', latitude: 11.85, longitude: 13.16, heading: 90 }),
      );
      expect(payload).not.toHaveProperty('driverUserId');
      expect(payload).not.toHaveProperty('fullName');
    });
  });

  describe('handleRideStatusChanged', () => {
    it('broadcasts to the ride room and both party rooms', () => {
      const { gateway } = buildGateway();
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;

      gateway.handleRideStatusChanged({
        rideId: 'ride-1',
        status: RideStatus.ACCEPTED,
        passengerUserId: 'passenger-1',
        driverUserId: 'driver-1',
      });

      expect(gateway.server.to).toHaveBeenCalledWith('ride:ride-1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:passenger-1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:driver-1');
      expect(emit).toHaveBeenCalledTimes(3);
    });

    it('does not attempt to notify a driver room when there is no driver yet', () => {
      const { gateway } = buildGateway();
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;

      gateway.handleRideStatusChanged({
        rideId: 'ride-1',
        status: RideStatus.REQUESTED,
        passengerUserId: 'passenger-1',
        driverUserId: null,
      });

      expect(gateway.server.to).not.toHaveBeenCalledWith('user:null');
      expect(emit).toHaveBeenCalledTimes(2); // ride room + passenger room only
    });
  });

  describe('handleDeliverySubscribe', () => {
    it('joins the delivery room once authorized', async () => {
      const { gateway, deliveriesService } = buildGateway();
      const client = buildSocketMock({ userId: 'user-1', role: Role.PASSENGER, sessionId: 's1' });
      deliveriesService.getDelivery.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000' });

      const result = await gateway.handleDeliverySubscribe(client as any, {
        deliveryId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(client.join).toHaveBeenCalledWith('delivery:123e4567-e89b-12d3-a456-426614174000');
      expect(result).toEqual({ subscribed: true, deliveryId: '123e4567-e89b-12d3-a456-426614174000' });
    });
  });

  describe('handleDriverLocation — routes to whichever job is active', () => {
    it('broadcasts to the delivery room when the driver has no active ride but has an active delivery', async () => {
      const { gateway, ridesService, deliveriesService } = buildGateway();
      const client = buildSocketMock({ userId: 'driver-1', role: Role.DRIVER, sessionId: 's1' });
      ridesService.getCurrentForDriver.mockResolvedValue(null);
      deliveriesService.getCurrentForDriver.mockResolvedValue({ id: 'delivery-1', status: 'IN_TRANSIT' });

      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;

      await gateway.handleDriverLocation(client as any, { latitude: 11.85, longitude: 13.16 });

      expect(gateway.server.to).toHaveBeenCalledWith('delivery:delivery-1');
      const [eventName, payload] = emit.mock.calls[0];
      expect(eventName).toBe('delivery:driver_location');
      expect(payload).toEqual(expect.objectContaining({ deliveryId: 'delivery-1' }));
    });

    it('rejects when the driver has neither an active ride nor an active delivery', async () => {
      const { gateway, ridesService, deliveriesService } = buildGateway();
      const client = buildSocketMock({ userId: 'driver-1', role: Role.DRIVER, sessionId: 's1' });
      ridesService.getCurrentForDriver.mockResolvedValue(null);
      deliveriesService.getCurrentForDriver.mockResolvedValue(null);

      await expect(
        gateway.handleDriverLocation(client as any, { latitude: 11.85, longitude: 13.16 }),
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleDeliveryStatusChanged', () => {
    it('broadcasts to the delivery room and both party rooms', () => {
      const { gateway } = buildGateway();
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;

      gateway.handleDeliveryStatusChanged({
        deliveryId: 'delivery-1',
        status: 'PACKAGE_PICKUP_PENDING' as any,
        senderUserId: 'sender-1',
        driverUserId: 'driver-1',
      });

      expect(gateway.server.to).toHaveBeenCalledWith('delivery:delivery-1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:sender-1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:driver-1');
      expect(emit).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleConnection', () => {
    it('disconnects a socket with no token', async () => {
      const { gateway } = buildGateway();
      const client = { handshake: { auth: {}, headers: {} }, join: jest.fn(), data: {}, disconnect: jest.fn() };

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a socket whose token fails verification', async () => {
      const { gateway, jwtService } = buildGateway();
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
      const client = {
        handshake: { auth: { token: 'bad' }, headers: {} },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('joins the user room on successful auth', async () => {
      const { gateway, jwtService, prisma } = buildGateway();
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', role: Role.PASSENGER, sid: 'session-1' });
      prisma.deviceSession.findUnique.mockResolvedValue({
        id: 'session-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.PASSENGER, status: 'ACTIVE', deletedAt: null });

      const client = {
        handshake: { auth: { token: 'good' }, headers: {} },
        join: jest.fn().mockResolvedValue(undefined),
        data: {} as any,
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(client as any);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.data.user).toEqual({ userId: 'user-1', role: Role.PASSENGER, sessionId: 'session-1' });
    });
  });
});
