import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'searchschool/:selectedCountry/:detectedCountry/:selectedCountryName',
    loadChildren: () => import('./searchschool/searchschool.module').then( m => m.SearchschoolPageModule)
  },
  {
    path: 'searchcountry',
    loadChildren: () => import('./searchcountry/searchcountry.module').then( m => m.SearchcountryPageModule)
  },
  {
    path: 'newschool/:schoolId/:selectedCountry/:detectedCountry/:selectedCountryName',
    loadChildren: () => import('./register-new-school/register-new-school.module').then( m => m.RegisterNewSchoolModule)
  },
  {
    path: 'register-school',
    loadChildren: () => import('./register-school/register-school.module').then( m => m.RegisterSchoolModule)
  },
  {
    path: 'schooldetails/:schoolId/:selectedCountry/:detectedCountry/:selectedCountryName',
    loadChildren: () => import('./schooldetails/schooldetails.module').then( m => m.SchooldetailsPageModule)
  },
  {
    path: 'confirmschool/:schoolId/:selectedCountry/:detectedCountry/:selectedCountryName',
    loadChildren: () => import('./confirmschool/confirmschool.module').then( m => m.ConfirmschoolPageModule)
  }
  ,
  {
    path: 'save-email/:schoolId/:selectedCountry/:detectedCountry',
    loadChildren: () => import('./school-email-register/school-email-register.module').then( m => m.SchoolEmailRegisterModule)
  },
  {
    path: 'schoolnotfound/:schoolId/:selectedCountry/:detectedCountry/:selectedCountryName',
    loadChildren: () => import('./schoolnotfound/schoolnotfound.module').then( m => m.SchoolnotfoundPageModule)
  },
  {
    path: 'invalidlocation/:schoolId/:selectedCountry/:country',
    loadChildren: () => import('./invalidlocation/invalidlocation.module').then( m => m.InvalidLocationPageModule)
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
