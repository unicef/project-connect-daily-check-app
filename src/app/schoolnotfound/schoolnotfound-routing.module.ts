import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SchoolnotfoundPage } from './schoolnotfound.page';

const routes: Routes = [
  {
    path: '',
    component: SchoolnotfoundPage,
  },
  {
    path: ':notFound',
    component: SchoolnotfoundPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SchoolnotfoundPageRoutingModule {}
