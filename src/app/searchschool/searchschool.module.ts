import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SearchschoolPage } from './searchschool.page';
import { SharedModule } from '../shared/shared.module';
import { SearchschoolPageRoutingModule } from './searchschool-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SearchschoolPageRoutingModule,
    SharedModule
  ],
  declarations: [SearchschoolPage]
})
export class SearchschoolPageModule {}
