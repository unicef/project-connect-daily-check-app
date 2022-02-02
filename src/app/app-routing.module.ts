import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'searchschool',
    loadChildren: () => import('./searchschool/searchschool.module').then( m => m.SearchschoolPageModule)
  },
  {
    path: 'searchcountry',
    loadChildren: () => import('./searchcountry/searchcountry.module').then( m => m.SearchcountryPageModule)
  },
  {
    path: 'schooldetails/:schoolId',
    loadChildren: () => import('./schooldetails/schooldetails.module').then( m => m.SchooldetailsPageModule)
  }
  ,
  {
    path: '',
    redirectTo: 'home',    
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
