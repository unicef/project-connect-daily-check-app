import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SchoolsuccessPage } from './schoolsuccess.page';

import { SchoolsuccessPageRoutingModule } from './schoolsuccess-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SchoolsuccessPageRoutingModule
  ],
  declarations: [SchoolsuccessPage]
})
export class SchoolsuccessPageModule {}
