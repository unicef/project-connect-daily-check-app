import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { Router, NavigationExtras, ActivatedRoute } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';
@Component({
  selector: 'app-searchschool',
  templateUrl: 'searchschool.page.html',
  styleUrls: ['searchschool.page.scss'],
})
export class SearchschoolPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  schoolId: any;
  isDisabled = true;
  schoolData: any;
  totalPages: number;
  recordsPerPage: any = 5;
  page : number = 1;
  isLoading = false;
  public faqData = [];
  isLoaded=false;
  constructor(
    private router: Router,
    private routeParams: ActivatedRoute,
    private schoolService: SchoolService,
    private settingsService: SettingsService,
    public loading: LoadingService) {
      this.setFAQData(0,this.recordsPerPage);
    }
  /**
   * Search school by id
   */
  searchSchoolById(){
    if(this.schoolId){ 
      let loadingMsg = '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white">Searching for your school...</p></div>';
      this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');
      this.schoolService.getById(this.schoolId).subscribe(
        (response) => {
          this.schoolData = response;
        },(err) => {
          console.log('ERROR: ' + err);
          this.loading.dismiss();
          this.router.navigate(['schoolnotfound',this.schoolId]);
          /* Redirect to no result found page */
        },
        () => {
          this.loading.dismiss();
          if(this.schoolData.length > 0){
            this.router.navigate(['schooldetails',this.schoolId]);
          } else {
            /* Redirect to no result found page */
            this.router.navigate(['schoolnotfound',this.schoolId]);
          }
        }
      ); 
    }   
  }

  /**
   * Validate if the provided school id is provided and length
   * is greater than 4. Based on that search school button will be enabled
   * @param schoolId 
   */
  validateSchoolId(schoolId){
    if(schoolId && schoolId.length >=2){
      this.isDisabled = false;
    } else {
      this.isDisabled = true;
    }
  }

  openExternalUrl(href){
    this.settingsService.getShell().shell.openExternal(href);
  }

  setFAQData(index, pageCount){
    this.schoolService.getSupportData(index, pageCount).subscribe(
      (response) => {
        this.faqData = response[1];
        this.isLoaded = true;
        this.totalPages = response[0].totalCount;
      },(err) => {
        console.log('ERROR: ' + err);
        this.loading.dismiss();
      },
      () => {
        this.loading.dismiss();
      }
    ); 
  }

  pageChanged=async(pageNumber:any) =>{
    this.page = pageNumber;
    let index = this.recordsPerPage * (pageNumber - 1);
    this.setFAQData(index, this.recordsPerPage);
  }
    
}
