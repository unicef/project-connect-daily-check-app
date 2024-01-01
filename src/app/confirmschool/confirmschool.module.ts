import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ConfirmschoolPage } from './confirmschool.page';
import { SharedModule } from '../shared/shared.module';
import { ConfirmschoolPageRoutingModule } from './confirmschool-routing.module';
import { PcdcHeaderComponent } from '../pcdc-header/pcdc-header.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConfirmschoolPageRoutingModule,
    SharedModule,
  ],
  declarations: [ConfirmschoolPage, PcdcHeaderComponent],
})
export class ConfirmschoolPageModule {}
