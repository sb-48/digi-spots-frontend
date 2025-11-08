import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-access-guard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './access-guard.html',
  styleUrl: './access-guard.scss'
})
export class AccessGuardComponent {
  @Input() errorMessage = '';
  @Output() submitPassword = new EventEmitter<string>();

  password = '';

  onSubmit() {
    if (!this.password.trim()) {
      return;
    }
    this.submitPassword.emit(this.password.trim());
    this.password = '';
  }
}
