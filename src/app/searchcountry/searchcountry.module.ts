import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule,ReactiveFormsModule } from '@angular/forms';
import { SearchcountryPage } from './searchcountry.page';
import { SharedModule } from '../shared/shared.module';
import { SearchcountryPageRoutingModule } from './searchcountry-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    
    IonicModule,
    SearchcountryPageRoutingModule,
    SharedModule
  ],
  declarations: [SearchcountryPage]
})
export class SearchcountryPageModule {}
