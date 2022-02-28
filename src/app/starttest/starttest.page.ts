import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { MenuController } from '@ionic/angular';


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
    private menu: MenuController,
    private schoolService: SchoolService) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
    });    
  }
  openFirst() {
    this.menu.enable(true, 'first');
    this.menu.open('first');
  }

  closeMenu() {
    this.menu.open('end');
  }
  showTestResult(){
    this.router.navigate(['connectivitytest']);
  }
}
