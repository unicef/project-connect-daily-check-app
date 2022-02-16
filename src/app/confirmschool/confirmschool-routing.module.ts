import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfirmschoolPage } from './confirmschool.page';

const routes: Routes = [
  {
    path: '',
    component: ConfirmschoolPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConfirmschoolPageRoutingModule {}
