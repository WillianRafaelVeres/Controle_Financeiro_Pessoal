"""Per-user data isolation (multi-tenancy).

The whole application stores every user's financial data in the same set of
tables. Without scoping, any authenticated user would see everyone's data
(the bug this module fixes). Instead of threading ``user_id`` through every one
of the ~13 services and ~18 route handlers (error-prone: a single missed query
leaks data), isolation is enforced centrally with two SQLAlchemy session
listeners:

* ``do_orm_execute`` adds a ``WHERE user_id = :current_user`` criteria to every
  ORM SELECT (including ``Session.get`` and relationship loads) for tables that
  inherit :class:`~app.models.base.UserOwnedMixin`.
* ``before_flush`` stamps the current user's id on every new user-owned row.

The active user is carried on the session itself via ``session.info["user_id"]``,
set per request in :func:`app.core.database.get_session`. Storing it on the
session (rather than a ContextVar) keeps it correct across FastAPI's sync
dependency threadpool, and the event listeners always receive the session. When
it is absent, no filtering or stamping happens, which is exactly what the
desktop/local single-user build and the background startup tasks need.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy import event
from sqlalchemy.orm import with_loader_criteria
from sqlmodel import Session, select

from app.models.base import UserOwnedMixin

# Key under which the authenticated user id is stored on ``Session.info``.
SESSION_USER_KEY = "user_id"


def _all_subclasses(base: type) -> set[type]:
    found: set[type] = set()
    stack = [base]
    while stack:
        current = stack.pop()
        for sub in current.__subclasses__():
            if sub not in found:
                found.add(sub)
                stack.append(sub)
    return found


@lru_cache(maxsize=1)
def user_owned_models() -> tuple[type, ...]:
    """All mapped tables that belong to a single user."""
    import app.models  # noqa: F401  -- ensure every model module is imported/registered

    models = [
        cls
        for cls in _all_subclasses(UserOwnedMixin)
        if getattr(cls, "__tablename__", None) is not None and hasattr(cls, "__mapper__")
    ]
    return tuple(models)


@event.listens_for(Session, "do_orm_execute")
def _apply_user_filter(orm_execute_state) -> None:
    if not orm_execute_state.is_select:
        return
    user_id = orm_execute_state.session.info.get(SESSION_USER_KEY)
    if user_id is None:
        return
    options = [
        with_loader_criteria(model, model.user_id == user_id, include_aliases=True)
        for model in user_owned_models()
    ]
    if options:
        orm_execute_state.statement = orm_execute_state.statement.options(*options)


@event.listens_for(Session, "before_flush")
def _stamp_user_id(session: Session, flush_context, instances) -> None:
    user_id = session.info.get(SESSION_USER_KEY)
    if user_id is None:
        return
    for obj in session.new:
        if isinstance(obj, UserOwnedMixin) and getattr(obj, "user_id", None) is None:
            obj.user_id = user_id


def ensure_user_initialized(session: Session, user_id: str) -> None:
    """Seed the data a brand-new user needs (idempotent).

    Runs within the user's own context so the lookup is already scoped. Mirrors
    the ``Investimentos`` system category that the desktop build seeds globally
    at startup, but per user (the investments screen requires it to exist).
    """
    from app.models.base import NaturezaCategoria
    from app.models.categoria import Categoria

    existente = session.exec(select(Categoria).where(Categoria.nome == "Investimentos")).first()
    if existente:
        return
    session.add(
        Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO, user_id=user_id)
    )
    session.commit()
