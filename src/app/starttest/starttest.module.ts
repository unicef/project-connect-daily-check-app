import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { StarttestPage } from './starttest.page';
import { StarttestPageRoutingModule } from './starttest-routing.module';
import { PcdcHeaderComponent } from '../pcdc-header/pcdc-header.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StarttestPageRoutingModule,
    SharedModule,
  ],
  declarations: [StarttestPage, PcdcHeaderComponent],
})
export class StarttestPageModule {}
