import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { StarttestPage } from './starttest.page';

import { StarttestPageRoutingModule } from './starttest-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StarttestPageRoutingModule
  ],
  declarations: [StarttestPage]
})
export class StarttestPageModule {}
