import {NgModule} from '@angular/core';
import {Ng2StatsService} from './ng2-stats.service';

export * from './ng2-stats.service';

@NgModule({
  providers: [Ng2StatsService],
  exports: []
})
export class Ng2StatsModule {}
