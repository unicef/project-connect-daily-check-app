import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-schooldetails',
  templateUrl: 'schooldetails.page.html',
  styleUrls: ['schooldetails.page.scss'],
})
export class SchooldetailsPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  selectedSchool:any;
  isDisabled = true;
  private sub: any;
  constructor(
    private activatedroute: ActivatedRoute, 
    public loading: LoadingService,
    private router: Router,
    private schoolService: SchoolService) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
      this.selectedSchool = {};
      this.searchSchoolById(this.schoolId);
    });    
  }

  /**
   * Get school information by id
   * @param id 
   */
  searchSchoolById(id){
    let loadingMsg = '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white">Searching for your school...</p></div>';
    this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');
    this.schoolService.getById(id).subscribe(
      (response) => {
        this.schools = response;
      },(err) => {
        this.loading.dismiss();
      },
      () => {
        this.loading.dismiss();
      }
    ); 
  }

  confirmSchool(schoolObj){
    
    this.selectedSchool = schoolObj;
    this.router.navigate(['confirmschool',this.selectedSchool.school_id],{state:this.selectedSchool});
  }

  schoolSelection(schoolObj){
    this.selectedSchool = schoolObj;
  }

  validateSelectedSchool(gigaId){
    console.log(gigaId);
    if(gigaId){
      this.isDisabled = false;
    } else {
      this.isDisabled = true;
    }
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
