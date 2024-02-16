import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SchoolsuccessPage } from './schoolsuccess.page';

const routes: Routes = [
  {
    path: '',
    component: SchoolsuccessPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SchoolsuccessPageRoutingModule {}
