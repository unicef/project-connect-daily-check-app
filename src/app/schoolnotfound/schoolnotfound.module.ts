import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SchoolnotfoundPage } from './schoolnotfound.page';
import { SharedModule } from '../shared/shared.module';
import { SchoolnotfoundPageRoutingModule } from './schoolnotfound-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SchoolnotfoundPageRoutingModule,
    SharedModule
  ],
  declarations: [SchoolnotfoundPage]
})
export class SchoolnotfoundPageModule {}
