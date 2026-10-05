import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { RouteController, RideRouteController } from './route.controller';
import { RouteService } from './route.service';
import { ROUTE_PROVIDER } from './interfaces/route-provider.interface';
import { MockRouteProvider } from './providers/mock-route.provider';
import { MapboxRouteProvider } from './providers/mapbox-route.provider';

@Module({
  controllers: [RouteController, RideRouteController],
  providers: [
    RouteService,
    MockRouteProvider,
    MapboxRouteProvider,
    {
      provide: ROUTE_PROVIDER,
      inject: [AppConfigService, MockRouteProvider, MapboxRouteProvider],
      useFactory: (config: AppConfigService, mock: MockRouteProvider, mapbox: MapboxRouteProvider) =>
        config.route.provider === 'mapbox' ? mapbox : mock,
    },
  ],
  exports: [RouteService],
})
export class RouteModule {}
