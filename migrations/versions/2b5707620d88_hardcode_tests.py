"""hardcode_tests

Revision ID: 2b5707620d88
Revises: dd83b979f58e
Create Date: 2024-08-04 20:50:01.736105

"""
from typing import Sequence, Union

import inspect
import sqlalchemy as sa
from alembic import op

# from sqlalchemy.engine.reflection import Inspector
# conn = op.get_bind()
# inspector = Inspector.from_engine(conn)
# tables = inspector.get_table_names()

# revision identifiers, used by Alembic.
revision: str = '2b5707620d88'
down_revision: Union[str, None] = 'dd83b979f58e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name, column_name):
    bind = op.get_context().bind
    insp = inspect(bind)
    columns = insp.get_columns(table_name)
    return any(c["name"] == column_name for c in columns)


# if 'table_name' not in tables:


def upgrade() -> None:
    conn = op.get_bind()

    inspector = sa.inspect(conn)

    if 'hardcode_value' not in [c['name'] for c in inspector.get_columns('answers')]:

        op.add_column('answers', sa.Column('hardcode_value', sa.Integer(), nullable=True))
    conn = op.get_bind()

    inspector = sa.inspect(conn)

    if 'hardcode_value' not in [c['name'] for c in inspector.get_columns('progresses')]:

        op.add_column('progresses', sa.Column('hardcode_value', sa.Text(), nullable=True))
    op.alter_column('progresses', 'value',
                    existing_type=sa.INTEGER(),
                    nullable=True)
    conn = op.get_bind()

    inspector = sa.inspect(conn)

    if 'hardcode_test' not in [c['name'] for c in inspector.get_columns('tests')]:

        op.add_column('tests', sa.Column('hardcode_test', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('tests', 'hardcode_test')
    op.alter_column('progresses', 'value',
                    existing_type=sa.INTEGER(),
                    nullable=False)
    op.drop_column('progresses', 'hardcode_value')
    op.drop_column('answers', 'hardcode_value')
