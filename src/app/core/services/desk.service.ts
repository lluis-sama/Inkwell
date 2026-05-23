import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DeskService {
  private readonly _newDocument$ = new Subject<string>();
  readonly newDocument$ = this._newDocument$.asObservable();

  notifyNewDocument(name: string): void {
    this._newDocument$.next(name);
  }
}
