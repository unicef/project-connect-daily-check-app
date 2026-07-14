import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RegisterNewSchoolComponent } from './component/register-new-school.component';

const routes: Routes = [
  {
    path: '',
    component: RegisterNewSchoolComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RegisterNewSchoolRoutingModule {}
