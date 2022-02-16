import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClientModule } from '@angular/common/http';
import { MlabService } from './mlab.service';

describe('MlabService', () => {
  let service: MlabService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:[
        HttpClientModule,
        HttpClientTestingModule
      ]
    });
    service = TestBed.inject(MlabService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
