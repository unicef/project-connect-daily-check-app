import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { StarttestPage } from './starttest.page';
import { StarttestPageRoutingModule } from './starttest-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StarttestPageRoutingModule,
    SharedModule
  ],
  declarations: [StarttestPage]
})
export class StarttestPageModule {}
