import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SearchcountryPage } from './searchcountry.page';

import { SearchcountryPageRoutingModule } from './searchcountry-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SearchcountryPageRoutingModule
  ],
  declarations: [SearchcountryPage]
})
export class SearchcountryPageModule {}
