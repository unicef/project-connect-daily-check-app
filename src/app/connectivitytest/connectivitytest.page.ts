import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-connectivitytest',
  templateUrl: 'connectivitytest.page.html',
  styleUrls: ['connectivitytest.page.scss'],
})
export class ConnectivitytestPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  private sub: any;
  isResultGenerated:boolean = false;
  constructor(
    private activatedroute: ActivatedRoute, 
    public loading: LoadingService,
    private schoolService: SchoolService) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;     
    });
    this.isResultGenerated = false;
  }
}
