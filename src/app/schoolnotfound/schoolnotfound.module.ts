import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SchoolnotfoundPage } from './schoolnotfound.page';

import { SchoolnotfoundPageRoutingModule } from './schoolnotfound-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SchoolnotfoundPageRoutingModule
  ],
  declarations: [SchoolnotfoundPage]
})
export class SchoolnotfoundPageModule {}
