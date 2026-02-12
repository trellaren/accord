### Public/Private Messaging for the cli voipfrom accord.cli import pass_environment
from accord.cli import pass_environment
import click

@click.command("thread", short_help="Provides thread of messages.")
@click.argument("len", required=False)
@pass_environment
def cli(ctx, path):
    """Provides a list of available messages within a thread"""
    click.echo()