import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { IonSlides} from '@ionic/angular';
import { StorageService } from '../services/storage.service';

@Component({
  selector: 'app-schoolsuccess',
  templateUrl: 'schoolsuccess.page.html',
  styleUrls: ['schoolsuccess.page.scss'],
})
export class SchoolsuccessPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  @ViewChild('mySlider')slides: IonSlides;
  schools: any;
  schoolId: any;
  slideOpts = {
    speed: 400
  };
  isLast = false;
  constructor(
    private activatedroute: ActivatedRoute, 
    public loading: LoadingService,  
    private router: Router,  
    private storage: StorageService,
    private schoolService: SchoolService) {
      
  }
  swipeNext(){
    this.slides.slideNext();
  }
  reachedEnd(){
    this.isLast = true;
  }
  moveToStartTest(){
    this.router.navigate(['starttest']);
  }
}
