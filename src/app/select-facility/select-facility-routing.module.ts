import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SelectFacilityPage } from './select-facility.page';

const routes: Routes = [
  {
    path: '',
    component: SelectFacilityPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SelectFacilityRoutingModule {}
