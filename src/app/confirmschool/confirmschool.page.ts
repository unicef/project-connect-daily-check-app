import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { School } from '../models/models';
@Component({
  selector: 'app-confirmschool',
  templateUrl: 'confirmschool.page.html',
  styleUrls: ['confirmschool.page.scss'],
})
export class ConfirmschoolPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  school: any;
  schoolId: any;
  private sub: any;
  constructor(
    private activatedroute: ActivatedRoute, 
    public router: Router,
    private schoolService: SchoolService,
    private storage: StorageService,
    public loading: LoadingService
  ) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
      if(this.router.getCurrentNavigation()){
        this.school = this.router.getCurrentNavigation().extras.state as School;
      }      
    });   
  }
  
  confirmSchool(){
    /* Store school id and giga id inside storage */
    this.storage.set('schoolId',this.schoolId);
    this.storage.set('gigaId',this.school.giga_id);
    this.storage.set('schoolInfo',JSON.stringify(this.school));
    this.router.navigate(['/schoolsuccess']);
  }
}
