import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-starttest',
  templateUrl: 'starttest.page.html',
  styleUrls: ['starttest.page.scss'],
})
export class StarttestPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  private sub: any;
  constructor(
    private activatedroute: ActivatedRoute, 
    public loading: LoadingService,
    public router:Router,
    private schoolService: SchoolService) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
    });    
  }

  showTestResult(){
    this.router.navigate(['connectivitytest']);
  }
}
