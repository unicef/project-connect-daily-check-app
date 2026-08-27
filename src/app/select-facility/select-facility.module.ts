import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SelectFacilityPage } from './select-facility.page';
import { SelectFacilityRoutingModule } from './select-facility-routing.module';
import { PcdcHeaderComponent } from '../pcdc-header/pcdc-header.component';
import { SharedModule } from '../shared/shared.module';
import { EnterKeyClickDirective } from '../shared/directives/enter-key-click.directive';

@NgModule({
  declarations: [SelectFacilityPage, PcdcHeaderComponent, EnterKeyClickDirective],
  imports: [
    CommonModule,
    SharedModule,
    IonicModule,
    SelectFacilityRoutingModule,
    FormsModule,
  ],
})
export class SelectFacilityModule {}
