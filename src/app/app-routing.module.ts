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
  },
  {
    path: 'confirmschool/:schoolId',
    loadChildren: () => import('./confirmschool/confirmschool.module').then( m => m.ConfirmschoolPageModule)
  }
  ,
  {
    path: 'schoolnotfound/:schoolId',
    loadChildren: () => import('./schoolnotfound/schoolnotfound.module').then( m => m.SchoolnotfoundPageModule)
  }
  ,
  {
    path: 'schoolsuccess',
    loadChildren: () => import('./schoolsuccess/schoolsuccess.module').then( m => m.SchoolsuccessPageModule)
  }
  ,
  {
    path: 'starttest',
    loadChildren: () => import('./starttest/starttest.module').then( m => m.StarttestPageModule)
  }
  ,
  {
    path: 'connectivitytest',
    loadChildren: () => import('./connectivitytest/connectivitytest.module').then( m => m.ConnectivitytestPageModule)
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
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules, useHash: true })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
