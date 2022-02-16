import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SchooldetailsPage } from './schooldetails.page';
import { SharedModule } from '../shared/shared.module';
import { SchooldetailsPageRoutingModule } from './schooldetails-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SchooldetailsPageRoutingModule,
    SharedModule
  ],
  declarations: [SchooldetailsPage]
})
export class SchooldetailsPageModule {}
