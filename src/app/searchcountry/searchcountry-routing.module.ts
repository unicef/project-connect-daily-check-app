import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SearchcountryPage } from './searchcountry.page';

const routes: Routes = [
  {
    path: '',
    component: SearchcountryPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SearchcountryPageRoutingModule {}
