import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-schoolsuccess',
  templateUrl: 'schoolsuccess.page.html',
  styleUrls: ['schoolsuccess.page.scss'],
})
export class SchoolsuccessPage {
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
    });    
  }
}
