import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ModalPage } from './modal.page';

const routes: Routes = [
  {
    path: '',
    component: ModalPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ModalPageRoutingModule {}
