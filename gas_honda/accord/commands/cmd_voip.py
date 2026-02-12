from accord.cli import pass_environment
import click

@click.command("voip", short_help="Shows users connected to voice channel.")
@click.argument("disconnect", required=False)
@pass_environment
def cli(ctx, path):
    """Provides a list of connected users in voice channel"""
    click.echo()