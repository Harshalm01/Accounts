from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    """
    Custom User model with role-based access control
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('viewer', 'Viewer'),
    ]

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='viewer',
        help_text='User role for permission management'
    )

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_admin(self):
        return self.role == 'admin'

    @property
    def is_manager(self):
        return self.role == 'manager'

    @property
    def is_viewer(self):
        return self.role == 'viewer'

    def can(self, permission):
        """
        Check if user has a specific permission based on role
        """
        permissions = {
            'admin': ['view', 'create', 'edit', 'delete', 'manage_users'],
            'manager': ['view', 'create', 'edit'],
            'viewer': ['view'],
        }
        return permission in permissions.get(self.role, [])
