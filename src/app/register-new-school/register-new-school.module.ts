import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PcdcHeaderComponent } from '../pcdc-header/pcdc-header.component';
import { SharedModule } from '../shared/shared.module';
import { IonicModule } from '@ionic/angular';
import { EnterKeyClickDirective } from '../shared/directives/enter-key-click.directive';
import { ReactiveFormsModule } from '@angular/forms';
import { RegisterNewSchoolComponent } from './component/register-new-school.component';
import { RegisterNewSchoolRoutingModule } from './register-new-school-routing.module';



@NgModule({
  declarations: [RegisterNewSchoolComponent, PcdcHeaderComponent, EnterKeyClickDirective],
  imports: [
    CommonModule,
    SharedModule,
    IonicModule,
    RegisterNewSchoolRoutingModule,
    ReactiveFormsModule
  ]
})
export class RegisterNewSchoolModule { }
