import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SchooldetailsPage } from './schooldetails.page';

import { SchooldetailsPageRoutingModule } from './schooldetails-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SchooldetailsPageRoutingModule
  ],
  declarations: [SchooldetailsPage]
})
export class SchooldetailsPageModule {}
