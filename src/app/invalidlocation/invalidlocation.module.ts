import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { InvalidLocationPage } from './invalidlocation.page';
import { SharedModule } from '../shared/shared.module';
import { InvalidLocationPageRoutingModule } from './invalidlocation-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    InvalidLocationPageRoutingModule,
    SharedModule
  ],
  declarations: [InvalidLocationPage]
})
export class InvalidLocationPageModule {}
