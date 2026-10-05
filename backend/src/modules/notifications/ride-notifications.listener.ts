import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RidesService } from '../rides/rides.service';
import { RideStatus } from '../../common/enums/ride-status.enum';
import { NotificationsService } from './notifications.service';
import { rideStatusNotificationFor, newRideNearbyNotification } from './notification-content.util';

interface RideStatusChangedEvent {
  rideId: string;
  status: RideStatus;
  passengerUserId?: string;
  driverUserId?: string | null;
}

@Injectable()
export class RideNotificationsListener {
  private readonly logger = new Logger(RideNotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly ridesService: RidesService,
  ) {}

  @OnEvent('ride.status_changed')
  async handleRideStatusChanged(event: RideStatusChangedEvent): Promise<void> {
    if (event.status === RideStatus.REQUESTED) {
      await this.dispatchToEligibleDrivers(event.rideId);
      return;
    }

    if (event.passengerUserId) {
      const content = rideStatusNotificationFor('passenger', event.status);
      if (content) {
        await this.notifications.notify(event.passengerUserId, content, { rideId: event.rideId });
      }
    }

    if (event.driverUserId) {
      const content = rideStatusNotificationFor('driver', event.status);
      if (content) {
        await this.notifications.notify(event.driverUserId, content, { rideId: event.rideId });
      }
    }
  }

  /**
   * The dispatch-broadcast piece explicitly deferred in Phase 5 — a
   * best-effort push nudge to nearby eligible drivers. REST polling
   * (`GET /drivers/rides/available` from Phase 4) remains the reliable
   * source of truth; this just makes discovery faster when it works.
   */
  private async dispatchToEligibleDrivers(rideId: string): Promise<void> {
    let eligibleDriverUserIds: string[] = [];
    try {
      eligibleDriverUserIds = await this.ridesService.findEligibleDriverUserIdsForDispatch(rideId);
    } catch (error) {
      this.logger.warn(
        `Failed to compute dispatch candidates for ride ${rideId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const content = newRideNearbyNotification();
    await Promise.all(
      eligibleDriverUserIds.map((driverUserId) => this.notifications.notify(driverUserId, content, { rideId })),
    );
  }
}
