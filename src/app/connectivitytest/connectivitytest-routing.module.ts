import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConnectivitytestPage } from './connectivitytest.page';

const routes: Routes = [
  {
    path: '',
    component: ConnectivitytestPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConnectivitytestPageRoutingModule {}
