import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ConfirmschoolPage } from './confirmschool.page';
import { SharedModule } from '../shared/shared.module';
import { ConfirmschoolPageRoutingModule } from './confirmschool-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConfirmschoolPageRoutingModule,
    SharedModule
  ],
  declarations: [ConfirmschoolPage]
})
export class ConfirmschoolPageModule {}
