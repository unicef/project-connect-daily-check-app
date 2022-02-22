import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ConnectivitytestPage } from './connectivitytest.page';

import { ConnectivitytestPageRoutingModule } from './connectivitytest-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConnectivitytestPageRoutingModule
  ],
  declarations: [ConnectivitytestPage]
})
export class ConnectivitytestPageModule {}
