import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-schoolnotfound',
  templateUrl: 'schoolnotfound.page.html',
  styleUrls: ['schoolnotfound.page.scss'],
})
export class SchoolnotfoundPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  private sub: any;
  constructor(
    private activatedroute: ActivatedRoute, 
    public loading: LoadingService,
    private schoolService: SchoolService) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
      this.searchSchoolById(this.schoolId);
    });    
  }

  /**
   * Get school information by id
   * @param id 
   */
  searchSchoolById(id){
    this.loading.present();
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

  gotoDailyCheck(){
    
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
