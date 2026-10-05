/**
 * Maximum straight-line distance (km) between a driver and a pickup point
 * for the driver to be shown that ride request. A fixed constant for now;
 * a later phase could make this configurable per operating area alongside
 * fare configuration.
 */
export const MAX_MATCHING_RADIUS_KM = 7;

/** How many candidate drivers to return to a requesting driver's "available nearby" view, at most. */
export const MAX_AVAILABLE_RIDES_RETURNED = 20;
