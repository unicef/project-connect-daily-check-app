import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SearchschoolPage } from './searchschool.page';

const routes: Routes = [
  {
    path: '',
    component: SearchschoolPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SearchschoolPageRoutingModule {}
