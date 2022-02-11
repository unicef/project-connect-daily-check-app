import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { Router, NavigationExtras, ActivatedRoute } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

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
  isLoading = false;
  constructor(
    private router: Router,
    private routeParams: ActivatedRoute,
    private schoolService: SchoolService,
    public loading: LoadingService) {}

  /**
   * Search school by id
   */
  searchSchoolById(){
    if(this.schoolId){ 
      let loadingMsg = '<ion-img src="assets/loader/loader.gif"></ion-img><p>Searching for your school</p>';
      this.loading.present(loadingMsg, 100000, 'pdcaLoaderClass', 'null');
      this.schoolService.getById(this.schoolId).subscribe(
        (response) => {
          this.schoolData = response;
        },(err) => {
          console.log('ERROR: ' + err);
          this.loading.dismiss();
          alert('Error:No school found.');
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
    if(schoolId && schoolId.length >=4){
      this.isDisabled = false;
    } else {
      this.isDisabled = true;
    }
  }
}
