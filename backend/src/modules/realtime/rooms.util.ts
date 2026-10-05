export function rideRoom(rideId: string): string {
  return `ride:${rideId}`;
}

export function deliveryRoom(deliveryId: string): string {
  return `delivery:${deliveryId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}
