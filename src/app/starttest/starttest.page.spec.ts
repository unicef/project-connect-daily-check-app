import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { StarttestPage } from './starttest.page';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NetworkService } from '../services/network.service';
describe('StarttestPage', () => {
  let component: StarttestPage;
  let fixture: ComponentFixture<StarttestPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    declarations: [StarttestPage],
    imports: [IonicModule.forRoot(), RouterTestingModule, TranslateModule.forRoot()],
    providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        // The IP lookup's request time limit is a timer, which waitForAsync
        // would wait for; an answer that never comes leaves none.
        {
          provide: NetworkService,
          useValue: { getNetInfo: () => new Promise(() => undefined) },
        },
    ]
}).compileComponents();

    fixture = TestBed.createComponent(StarttestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
