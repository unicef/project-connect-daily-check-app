import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StarttestPage } from './starttest.page';
import { TestDetailComponent } from './test-detail/test-detail.component';
import { TracerouteComponent } from './traceroute/traceroute.component';

const routes: Routes = [
  {
    path: '',
    component: StarttestPage,
  },{
    path: 'detail-page/:id',
    component: TestDetailComponent
  },{
    path: 'traceroute',
    component: TracerouteComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StarttestPageRoutingModule {}
